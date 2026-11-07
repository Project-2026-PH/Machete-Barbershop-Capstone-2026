import defaultDb from '../db';

export interface QueryExecutor {
  query<T = any>(text: string, params?: any[]): Promise<{ rows: T[]; rowCount?: number | null }>;
}

const TRANSIENT_CONNECTION_ERROR_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  '57P01',
  '57P02',
  '57P03',
]);

const isTransientConnectionError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { code?: unknown; message?: unknown };
  if (typeof candidate.code === 'string' && TRANSIENT_CONNECTION_ERROR_CODES.has(candidate.code)) return true;
  return typeof candidate.message === 'string' && /connection terminated due to connection timeout/i.test(candidate.message);
};

const delay = (milliseconds: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, milliseconds));

export type TransactionSortKey =
  | 'date_desc'
  | 'date_asc'
  | 'amount_desc'
  | 'amount_asc'
  | 'customer_asc'
  | 'customer_desc'
  | 'barber_asc'
  | 'barber_desc'
  | 'service_asc'
  | 'service_desc';

export type CustomerServedSortKey =
  | 'date_desc'
  | 'date_asc'
  | 'customer_asc'
  | 'customer_desc'
  | 'barber_asc'
  | 'barber_desc'
  | 'service_asc'
  | 'service_desc';

export interface CashierTransactionQueryOptions {
  todayOnly?: boolean;
  dateRange?: string;
  barberId?: number;
  search?: string;
  sortBy?: TransactionSortKey;
}

export interface CashierCustomerServedQueryOptions {
  sortBy?: CustomerServedSortKey;
}

const TRANSACTION_ORDER_BY: Record<TransactionSortKey, string> = {
  date_desc: 't.created_at DESC, t.transaction_id DESC',
  date_asc: 't.created_at ASC, t.transaction_id ASC',
  amount_desc: 't.total_amount DESC, t.transaction_id DESC',
  amount_asc: 't.total_amount ASC, t.transaction_id ASC',
  customer_asc: 'customer ASC, t.created_at DESC',
  customer_desc: 'customer DESC, t.created_at DESC',
  barber_asc: 'barber ASC, t.created_at DESC',
  barber_desc: 'barber DESC, t.created_at DESC',
  service_asc: 'service ASC, t.created_at DESC',
  service_desc: 'service DESC, t.created_at DESC',
};

const CUSTOMER_SERVED_ORDER_BY: Record<CustomerServedSortKey, string> = {
  date_desc: 'q.created_at DESC, q.id DESC',
  date_asc: 'q.created_at ASC, q.id ASC',
  customer_asc: 'customer ASC, q.created_at DESC',
  customer_desc: 'customer DESC, q.created_at DESC',
  barber_asc: 'barber ASC, q.created_at DESC',
  barber_desc: 'barber DESC, q.created_at DESC',
  service_asc: 'service ASC, q.created_at DESC',
  service_desc: 'service DESC, q.created_at DESC',
};

export const resolveTransactionSortKey = (sortBy?: string): TransactionSortKey => {
  if (sortBy && Object.prototype.hasOwnProperty.call(TRANSACTION_ORDER_BY, sortBy)) {
    return sortBy as TransactionSortKey;
  }
  return 'date_desc';
};

export const resolveCustomerServedSortKey = (sortBy?: string): CustomerServedSortKey => {
  if (sortBy && Object.prototype.hasOwnProperty.call(CUSTOMER_SERVED_ORDER_BY, sortBy)) {
    return sortBy as CustomerServedSortKey;
  }
  return 'date_desc';
};

/**
 * Repository for Cashier dashboard database operations.
 */
export class CashierRepository {
  private readonly db: QueryExecutor;

  constructor(database: QueryExecutor = defaultDb) {
    this.db = database;
  }

  private async queryReadWithOneTransientRetry<T = any>(text: string, params?: any[]): Promise<{ rows: T[]; rowCount?: number | null }> {
    try {
      return await this.db.query<T>(text, params);
    } catch (error) {
      if (!isTransientConnectionError(error)) throw error;
      await delay(150);
      return this.db.query<T>(text, params);
    }
  }

  /**
   * Reads today's total revenue and cash revenue in one transactions scan.
   * `transactions.created_at` is a legacy timestamp without time zone storing
   * UTC wall time, so Manila midnight is converted to UTC timestamp bounds to
   * keep the branch/created_at index usable.
   */
  async getDailySalesSummary(branchId: number): Promise<{ totalRevenue: number; cashSales: number }> {
    const result = await this.db.query(
      `WITH day_bounds AS (
         SELECT (NOW() AT TIME ZONE 'Asia/Manila')::date AS day
       )
       SELECT
         COALESCE(SUM(t.total_amount), 0) AS total_revenue,
         COALESCE(SUM(t.total_amount) FILTER (WHERE t.payment_method = 'Cash'), 0) AS cash_sales
       FROM transactions t
       CROSS JOIN day_bounds d
       WHERE t.branch_id = $1
         AND t.created_at >= ((d.day::timestamp AT TIME ZONE 'Asia/Manila') AT TIME ZONE 'UTC')
         AND t.created_at < (((d.day + 1)::timestamp AT TIME ZONE 'Asia/Manila') AT TIME ZONE 'UTC')`,
      [branchId]
    );
    return {
      totalRevenue: Number.parseFloat(result.rows[0].total_revenue),
      cashSales: Number.parseFloat(result.rows[0].cash_sales),
    };
  }

  /** Compatibility helpers for direct callers; dashboard uses the combined query above. */
  async getDailyRevenue(branchId: number): Promise<number> {
    return (await this.getDailySalesSummary(branchId)).totalRevenue;
  }

  async getDailyCashSales(branchId: number): Promise<number> {
    return (await this.getDailySalesSummary(branchId)).cashSales;
  }

  /**
   * Gets total customers served today for a given branch.
   */
  async getDailyCustomerCount(branchId: number): Promise<number> {
    const result = await this.db.query(
      `SELECT COUNT(id) as total_customers
       FROM queue_entries
       WHERE branch_id = $1
         AND status = 'completed'
         AND payment_status = 'paid'
         AND (created_at AT TIME ZONE 'Asia/Manila')::date = (NOW() AT TIME ZONE 'Asia/Manila')::date`,
      [branchId]
    );
    return parseInt(result.rows[0].total_customers, 10);
  }

  /**
   * Gets revenue and customer count per day for the last 7 days.
   */
  async getWeeklyPerformance(branchId: number): Promise<{ name: string; revenue: number; customers: number }[]> {
    const result = await this.db.query(
      `WITH days AS (
          SELECT generate_series(
            (NOW() AT TIME ZONE 'Asia/Manila')::date - INTERVAL '6 days',
            (NOW() AT TIME ZONE 'Asia/Manila')::date,
            '1 day'
          )::date AS day
       ), date_bounds AS (
          SELECT MIN(day) AS first_day, MAX(day) + 1 AS end_day FROM days
       ), transaction_daily AS (
          SELECT
            (t.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Manila')::date AS day,
            SUM(t.total_amount) AS revenue
          FROM transactions t
          CROSS JOIN date_bounds bounds
          WHERE t.branch_id = $1
            AND t.created_at >= ((bounds.first_day::timestamp AT TIME ZONE 'Asia/Manila') AT TIME ZONE 'UTC')
            AND t.created_at < ((bounds.end_day::timestamp AT TIME ZONE 'Asia/Manila') AT TIME ZONE 'UTC')
          GROUP BY 1
       ), customer_daily AS (
          SELECT
            (q.created_at AT TIME ZONE 'Asia/Manila')::date AS day,
            COUNT(*) AS customers
          FROM queue_entries q
          CROSS JOIN date_bounds bounds
          WHERE q.branch_id = $1
            AND q.status = 'completed'
            AND q.payment_status = 'paid'
            AND q.created_at >= (bounds.first_day::timestamp AT TIME ZONE 'Asia/Manila')
            AND q.created_at < (bounds.end_day::timestamp AT TIME ZONE 'Asia/Manila')
          GROUP BY 1
       )
       SELECT
          to_char(d.day, 'Dy') AS name,
          COALESCE(t.revenue, 0) AS revenue,
          COALESCE(q.customers, 0) AS customers
       FROM days d
       LEFT JOIN transaction_daily t ON t.day = d.day
       LEFT JOIN customer_daily q ON q.day = d.day
       ORDER BY d.day ASC`,
      [branchId]
    );
    return result.rows.map((row: any) => ({
      name: row.name,
      revenue: parseFloat(row.revenue),
      customers: parseInt(row.customers, 10),
    }));
  }

  /**
   * Gets barber breakdown for the selected period — customer count and services performed.
   */
  async getBarberBreakdown(branchId: number, dateRange = 'today'): Promise<any[]> {
    const resolvedDateRange = ['today', 'week', 'month'].includes(dateRange) ? dateRange : 'today';
    const servedDateCondition = resolvedDateRange === 'week'
      ? "(q.created_at AT TIME ZONE 'Asia/Manila')::date >= date_trunc('week', NOW() AT TIME ZONE 'Asia/Manila')::date AND (q.created_at AT TIME ZONE 'Asia/Manila')::date <= (NOW() AT TIME ZONE 'Asia/Manila')::date"
      : resolvedDateRange === 'month'
        ? "(q.created_at AT TIME ZONE 'Asia/Manila')::date >= date_trunc('month', NOW() AT TIME ZONE 'Asia/Manila')::date AND (q.created_at AT TIME ZONE 'Asia/Manila')::date < (date_trunc('month', NOW() AT TIME ZONE 'Asia/Manila') + INTERVAL '1 month')::date"
        : "(q.created_at AT TIME ZONE 'Asia/Manila')::date = (NOW() AT TIME ZONE 'Asia/Manila')::date";

    const result = await this.db.query(
      `SELECT
          b.barber_id,
          b.status as barber_status,
          b.name,
          COUNT(q.id) as customer_count,
          COALESCE(
            json_agg(
              json_build_object(
                'id', q.id,
                'name', COALESCE(
                  NULLIF(TRIM(CONCAT_WS(' ', c.first_name, c.last_name)), ''),
                  NULLIF(TRIM(q.customer_name), ''),
                  'Walk-in Customer'
                ),
                'service', COALESCE(s.title, 'Service'),
                'served_at', q.created_at
              ) ORDER BY q.created_at DESC, q.id DESC
            ) FILTER (WHERE q.id IS NOT NULL),
            '[]'::json
          ) as customers,
          json_agg(json_build_object('service_name', s.title)) FILTER (WHERE q.id IS NOT NULL) as services,
          EXISTS (
            SELECT 1 FROM queue_entries serving_queue
            WHERE serving_queue.barber_id = b.barber_id
              AND serving_queue.branch_id = $1
              AND serving_queue.status = 'serving'
              AND (serving_queue.created_at AT TIME ZONE 'Asia/Manila')::date = (NOW() AT TIME ZONE 'Asia/Manila')::date
          ) as is_serving
       FROM barbers b
       JOIN users u ON b.user_id = u.user_id
       LEFT JOIN queue_entries q ON q.barber_id = b.barber_id
         AND q.status = 'completed'
         AND q.payment_status = 'paid'
         AND q.branch_id = $1
         AND ${servedDateCondition}
       LEFT JOIN customers c ON c.customer_id = q.customer_id
       LEFT JOIN services s ON q.service_id = s.service_id
       WHERE u.branch_id = $1 AND b.is_active = TRUE
       GROUP BY b.barber_id, b.name, b.status`,
      [branchId]
    );
    return result.rows;
  }

  /**
   * Gets branch transactions in newest-first order for the cashier dashboard.
   * Supports optional today-only filtering and sortable ordering.
   */
  async getRecentTransactions(
    branchId: number,
    limit: number,
    offset: number,
    options: CashierTransactionQueryOptions = {},
  ): Promise<{
    rows: any[];
    total: number;
  }> {
    const {
      todayOnly = false,
      dateRange = 'all',
      barberId,
      search,
      sortBy = 'date_desc',
    } = options;
    const orderBy = TRANSACTION_ORDER_BY[resolveTransactionSortKey(sortBy)];

    const queryParams: Array<number | string> = [branchId];
    const conditions = ['t.branch_id = $1'];
    const addParam = (value: number | string) => {
      queryParams.push(value);
      return queryParams.length;
    };

    const resolvedDateRange = todayOnly ? 'today' : dateRange;
    // transactions.created_at is a legacy TIMESTAMP column populated from
    // CURRENT_TIMESTAMP and therefore stores the UTC wall-clock value. Build
    // half-open UTC timestamp boundaries for Manila calendar ranges so the
    // predicate remains index-friendly and does not lose records near midnight.
    const manilaToday = "(NOW() AT TIME ZONE 'Asia/Manila')::date";
    const manilaTodayStartUtc = `(${manilaToday}::timestamp AT TIME ZONE 'Asia/Manila' AT TIME ZONE 'UTC')`;
    const manilaTomorrowStartUtc = `(((${manilaToday} + INTERVAL '1 day')::date)::timestamp AT TIME ZONE 'Asia/Manila' AT TIME ZONE 'UTC')`;
    if (resolvedDateRange === 'today') {
      conditions.push(`t.created_at >= ${manilaTodayStartUtc}`);
      conditions.push(`t.created_at < ${manilaTomorrowStartUtc}`);
    } else if (resolvedDateRange === 'week') {
      const manilaWeekStartUtc = `((date_trunc('week', ${manilaToday}::timestamp)) AT TIME ZONE 'Asia/Manila' AT TIME ZONE 'UTC')`;
      conditions.push(`t.created_at >= ${manilaWeekStartUtc}`);
      conditions.push(`t.created_at < ${manilaTomorrowStartUtc}`);
    } else if (resolvedDateRange === 'month') {
      const manilaMonthStartUtc = `((date_trunc('month', ${manilaToday}::timestamp)) AT TIME ZONE 'Asia/Manila' AT TIME ZONE 'UTC')`;
      const manilaNextMonthStartUtc = `((date_trunc('month', ${manilaToday}::timestamp) + INTERVAL '1 month') AT TIME ZONE 'Asia/Manila' AT TIME ZONE 'UTC')`;
      conditions.push(`t.created_at >= ${manilaMonthStartUtc}`);
      conditions.push(`t.created_at < ${manilaNextMonthStartUtc}`);
    }

    if (Number.isInteger(barberId) && (barberId as number) > 0) {
      conditions.push(`t.barber_id = $${addParam(barberId as number)}`);
    }

    const trimmedSearch = search?.trim();
    if (trimmedSearch) {
      const searchParam = addParam(`%${trimmedSearch}%`);
      conditions.push(`(
        EXISTS (
          SELECT 1 FROM customers sc
          WHERE sc.customer_id = t.customer_id
            AND CONCAT_WS(' ', sc.first_name, sc.last_name) ILIKE $${searchParam}
        )
        OR EXISTS (
          SELECT 1 FROM queue_entries sq
          WHERE sq.id = t.queue_entry_id
            AND sq.customer_name ILIKE $${searchParam}
        )
        OR EXISTS (
          SELECT 1
          FROM barbers sb
          LEFT JOIN users sbu ON sbu.user_id = sb.user_id
          WHERE sb.barber_id = t.barber_id
            AND (sb.name ILIKE $${searchParam} OR sbu.username ILIKE $${searchParam})
        )
      )`);
    }

    const whereClause = conditions.join('\n           AND ');
    const rowParams = [...queryParams, limit, offset];
    const limitParam = queryParams.length + 1;
    const offsetParam = queryParams.length + 2;

    const countResult = await this.queryReadWithOneTransientRetry(
      `SELECT COUNT(*)::int AS total
       FROM transactions t
       WHERE ${whereClause}`,
      queryParams,
    );
    const transactionResult = await this.queryReadWithOneTransientRetry(
      `SELECT
         t.transaction_id AS id,
         t.total_amount AS amount,
         t.payment_method,
         t.gcash_ref_no,
         t.transaction_type,
         t.created_at,
         pa.payment_attempt_id,
         CASE WHEN LOWER(t.payment_method) = 'gcash' THEN pa.evidence_validation_status ELSE NULL END AS receipt_evidence_status,
         CASE WHEN LOWER(t.payment_method) = 'gcash' THEN (pa.receipt_storage_path IS NOT NULL OR t.reservation_fee_receipt_storage_path IS NOT NULL) ELSE NULL END AS receipt_available,
         (t.reservation_fee_receipt_storage_path IS NOT NULL) AS reservation_fee_receipt_available,
         COALESCE(
           NULLIF(TRIM(t.customer_name), ''),
           NULLIF(TRIM(CONCAT_WS(' ', c.first_name, c.last_name)), ''),
           NULLIF(TRIM(q.customer_name), ''),
           'Walk-in Customer'
         ) AS customer,
         CASE
           WHEN t.transaction_type = 'retail' THEN 'Retail sale'
           ELSE COALESCE(NULLIF(TRIM(b.name), ''), NULLIF(TRIM(bu.username), ''), 'Unassigned')
         END AS barber,
         CASE
           WHEN t.transaction_type = 'reservation_fee' THEN COALESCE(
             NULLIF(TRIM(string_agg(DISTINCT qs.title, ', ' ORDER BY qs.title)), ''),
             NULLIF(TRIM(string_agg(DISTINCT s.title, ', ' ORDER BY s.title)), ''),
             'Reservation Fee'
           )
           WHEN t.transaction_type = 'retail' THEN COALESCE(
             NULLIF((
               SELECT string_agg(DISTINCT p.name, ', ' ORDER BY p.name)
               FROM inventory_retail_sale_lines rl
               JOIN inventory_products p ON p.inventory_product_id = rl.inventory_product_id
               WHERE rl.transaction_id = t.transaction_id
             ), ''),
             'Retail'
           )
           ELSE COALESCE(
             NULLIF(TRIM(string_agg(DISTINCT s.title, ', ' ORDER BY s.title)), ''),
             NULLIF(TRIM(string_agg(DISTINCT qs.title, ', ' ORDER BY qs.title)), ''),
             'Service'
           )
         END AS service
       FROM transactions t
       LEFT JOIN payment_attempts pa ON pa.payment_attempt_id = t.payment_attempt_id
       LEFT JOIN queue_entries q ON q.id = t.queue_entry_id
       LEFT JOIN customers c ON c.customer_id = t.customer_id
       LEFT JOIN barbers b ON b.barber_id = t.barber_id
       LEFT JOIN users bu ON bu.user_id = b.user_id
       LEFT JOIN transaction_services ts ON ts.transaction_id = t.transaction_id
       LEFT JOIN services s ON s.service_id = ts.service_id
       LEFT JOIN services qs ON (
         qs.service_id = q.service_id 
         OR EXISTS (
           SELECT 1 FROM queue_entry_services qes 
           WHERE qes.queue_entry_id = q.id AND qes.service_id = qs.service_id
         )
       )
       WHERE ${whereClause}
       GROUP BY t.transaction_id, t.total_amount, t.payment_method, t.gcash_ref_no, t.transaction_type, t.created_at,
                pa.payment_attempt_id, pa.evidence_validation_status, pa.receipt_storage_path, t.reservation_fee_receipt_storage_path,
                t.customer_name, c.first_name, c.last_name, q.customer_name, b.name, bu.username
       ORDER BY ${orderBy}
       LIMIT $${limitParam} OFFSET $${offsetParam}`,
      rowParams,
    );

    return {
      rows: transactionResult.rows,
      total: Number(countResult.rows[0]?.total || 0),
    };
  }

  /**
   * Gets a branch's completed customer service history (queue entries).
   * Supports pagination and sorting for the Customers Served view.
   */
  async getCustomersServed(
    branchId: number,
    limit: number,
    offset: number,
    options: CashierCustomerServedQueryOptions = {},
  ): Promise<{
    rows: any[];
    total: number;
  }> {
    const { sortBy = 'date_desc' } = options;
    const orderBy = CUSTOMER_SERVED_ORDER_BY[resolveCustomerServedSortKey(sortBy)];

    const [countResult, entriesResult] = await Promise.all([
      this.db.query(
        `SELECT COUNT(*)::int AS total
         FROM queue_entries q
         WHERE q.branch_id = $1 AND q.status = 'completed' AND q.payment_status = 'paid'
           AND (q.created_at AT TIME ZONE 'Asia/Manila')::date = (NOW() AT TIME ZONE 'Asia/Manila')::date`,
        [branchId],
      ),
      this.db.query(
        `SELECT
           q.id,
           q.created_at,
           q.created_at AS served_at,
           gp.guest_reference,
           COALESCE(
             NULLIF(TRIM(CONCAT_WS(' ', c.first_name, c.last_name)), ''),
             NULLIF(TRIM(q.customer_name), ''),
             'Walk-in Customer'
           ) AS customer,
           COALESCE(NULLIF(TRIM(b.name), ''), NULLIF(TRIM(bu.username), ''), 'Unassigned') AS barber,
           COALESCE(s.title, 'Service') AS service,
           payment.total_amount,
           payment.payment_method,
           payment.payment_created_at,
           COALESCE(rd.receipt_number, payment.transaction_id) AS transaction_id,
           payment.gcash_ref_no,
           payment.receipt_evidence_status,
           payment.receipt_available
         FROM queue_entries q
         LEFT JOIN customers c ON c.customer_id = q.customer_id
         LEFT JOIN guest_profiles gp ON gp.guest_profile_id = q.guest_profile_id
         LEFT JOIN barbers b ON b.barber_id = q.barber_id
         LEFT JOIN users bu ON bu.user_id = b.user_id
         LEFT JOIN services s ON s.service_id = q.service_id
         LEFT JOIN receipt_documents rd ON rd.queue_entry_id = q.id
         LEFT JOIN LATERAL (
            SELECT
              SUM(t.total_amount) AS total_amount,
              CASE
                WHEN COUNT(*) = 0 THEN NULL
                WHEN COUNT(DISTINCT t.payment_method) = 1 THEN MAX(t.payment_method)
                ELSE STRING_AGG(DISTINCT t.payment_method, ' + ' ORDER BY t.payment_method)
              END AS payment_method,
              MAX(t.created_at) AS payment_created_at,
              STRING_AGG(t.transaction_id::text, ', ' ORDER BY t.transaction_id) AS transaction_id,
              STRING_AGG(DISTINCT NULLIF(TRIM(COALESCE(pa.gcash_ref_no, t.gcash_ref_no)), ''), ', ') AS gcash_ref_no,
              STRING_AGG(DISTINCT NULLIF(TRIM(pa.evidence_validation_status), ''), ', ') AS receipt_evidence_status,
              BOOL_OR(pa.receipt_storage_path IS NOT NULL) AS receipt_available
            FROM transactions t
            LEFT JOIN payment_attempts pa ON pa.payment_attempt_id = t.payment_attempt_id
            WHERE t.queue_entry_id = q.id AND t.branch_id = q.branch_id
          ) payment ON TRUE
         WHERE q.branch_id = $1 AND q.status = 'completed' AND q.payment_status = 'paid'
           AND (q.created_at AT TIME ZONE 'Asia/Manila')::date = (NOW() AT TIME ZONE 'Asia/Manila')::date
         ORDER BY ${orderBy}
         LIMIT $2 OFFSET $3`,
        [branchId, limit, offset],
      ),
    ]);

    return {
      rows: entriesResult.rows,
      total: Number(countResult.rows[0]?.total || 0),
    };
  }

  /**
   * Finds pending, accepted, and late reservations for the cashier branch.
   */
  async findPendingReservations(branchId?: number, statusFilter?: string | string[]): Promise<any[]> {
    const hasBranch = Number.isInteger(branchId) && (branchId as number) > 0;
    const branchFilter = hasBranch ? 'AND qe.branch_id = $1' : '';
    const queryParams = hasBranch ? [branchId as number] : [];

    let statusCondition = "qe.status IN ('pending', 'accepted', 'late')";
    let subStatusCondition = "sub_qe.status IN ('pending', 'accepted', 'late')";
    if (statusFilter === 'confirmed') {
      statusCondition = "qe.status IN ('accepted', 'late')";
      subStatusCondition = "sub_qe.status IN ('accepted', 'late')";
    } else if (statusFilter === 'pending') {
      statusCondition = "qe.status = 'pending'";
      subStatusCondition = "sub_qe.status = 'pending'";
    } else if (Array.isArray(statusFilter) && statusFilter.length > 0) {
      statusCondition = `qe.status IN (${statusFilter.map(s => `'${s.replace(/'/g, "''")}'`).join(',')})`;
      subStatusCondition = `sub_qe.status IN (${statusFilter.map(s => `'${s.replace(/'/g, "''")}'`).join(',')})`;
    }

    const result = await this.db.query(
      `SELECT qe.id, qe.customer_id, qe.customer_name, qe.group_booking_id, qe.guest_name,
              qe.barber_id, b.name AS barber_name, qe.branch_id, qe.service_id,
              COALESCE(
                (SELECT ARRAY_AGG(qes.service_id ORDER BY qes.service_id)
                 FROM queue_entry_services qes
                 WHERE qes.queue_entry_id = qe.id),
                CASE WHEN qe.service_id IS NOT NULL THEN ARRAY[qe.service_id] ELSE ARRAY[]::int[] END
              ) AS service_ids,
              qe.status, qe.preferred_date, qe.preferred_time, qe.scheduled_start_at,
              qe.arrival_deadline_at, qe.arrived_at, qe.no_show_at, qe.created_at,
              qe.reference_number, qe.proof_image_url, qe.image_hash, qe.ocr_reference_number, qe.recipient_identifier_detected, qe.expires_at,
              COALESCE(
                qe.duration_minutes,
                (SELECT SUM(s2.duration_minutes) FROM queue_entry_services qes JOIN services s2 ON s2.service_id = qes.service_id WHERE qes.queue_entry_id = qe.id),
                s.duration_minutes,
                30
              ) AS duration_minutes,
              c.first_name, c.last_name, c.phone_number, c.email,
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
              (rf.transaction_id IS NOT NULL) AS reservation_fee_paid,
              rf.total_amount AS reservation_fee_amount,
              rf.payment_method AS reservation_fee_method,
              rf.transaction_id AS reservation_fee_transaction_id
       FROM queue_entries qe
       LEFT JOIN customers c ON qe.customer_id = c.customer_id
       LEFT JOIN barbers b ON qe.barber_id = b.barber_id
       LEFT JOIN services s ON qe.service_id = s.service_id
       LEFT JOIN LATERAL (
         SELECT transaction_id, total_amount, payment_method
         FROM transactions
         WHERE queue_entry_id = qe.id AND transaction_type = 'reservation_fee'
         ORDER BY transaction_id DESC
         LIMIT 1
       ) rf ON TRUE
       WHERE (${statusCondition} OR (
         qe.group_booking_id IS NOT NULL
         AND qe.group_booking_id IN (
           SELECT sub_qe.group_booking_id
           FROM queue_entries sub_qe
           WHERE sub_qe.group_booking_id IS NOT NULL
             AND ${subStatusCondition}
             ${branchFilter.replace(/qe\./g, 'sub_qe.')}
         )
       ))
         ${branchFilter}
       ORDER BY qe.preferred_date ASC, qe.preferred_time ASC, qe.barber_id ASC NULLS LAST, qe.id ASC`,
      queryParams,
    );
    return result.rows;
  }

  /**
   * Counts pending reservations for the cashier branch without transferring rows.
   */
  async countPendingReservations(branchId?: number): Promise<number> {
    const hasBranch = Number.isInteger(branchId) && (branchId as number) > 0;
    const branchFilter = hasBranch ? 'AND qe.branch_id = $1' : '';
    const queryParams = hasBranch ? [branchId as number] : [];
    const result = await this.db.query(
      `SELECT COUNT(*)::int AS total
       FROM queue_entries qe
       WHERE qe.status = 'pending'
         ${branchFilter}`,
      queryParams,
    );
    return Number(result.rows[0]?.total || 0);
  }

  /**
   * Finds an order (queue entry) by ID.
   */
  async findOrderById(id: string): Promise<any | null> {
    const result = await this.db.query(
      'SELECT * FROM queue_entries WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  }

  /** Finds an active app reservation by its customer-facing MCH code. */
  async findReservationByCode(code: string, branchId: number): Promise<any | null> {
    const match = /^MCH-(\d{1,10})$/i.exec(code.trim());
    if (!match) return null;
    const result = await this.db.query(
      `SELECT qe.*, c.first_name, c.last_name, c.phone_number
       FROM queue_entries qe
       LEFT JOIN customers c ON c.customer_id = qe.customer_id
       WHERE qe.id = $1 AND qe.branch_id = $2
         AND qe.status IN ('pending', 'accepted', 'late')
       LIMIT 1`,
      [Number(match[1]), branchId],
    );
    return result.rows[0] || null;
  }

  /** Finds a single active reservation by exact customer name for cashier reconciliation. */
  async findReservationsByCustomerName(customerName: string, branchId: number): Promise<any[]> {
    const result = await this.db.query(
      `SELECT qe.*, c.first_name, c.last_name, c.phone_number
       FROM queue_entries qe
       JOIN customers c ON c.customer_id = qe.customer_id
       WHERE qe.branch_id = $1
         AND qe.status IN ('pending', 'accepted', 'late')
         AND LOWER(TRIM(CONCAT_WS(' ', c.first_name, c.last_name))) = LOWER(TRIM($2))
       ORDER BY qe.preferred_date ASC, qe.preferred_time ASC, qe.id ASC`,
      [branchId, customerName],
    );
    return result.rows;
  }

  /**
   * Updates a barber's status (available, break, leave).
   */
  async updateBarberStatus(barberId: string, status: string, executor: QueryExecutor = this.db): Promise<void> {
    const normalizedStatus = status.trim().toLowerCase().replace(/\s+/g, '_');
    const dbStatus = normalizedStatus === 'break' ? 'on_break' : normalizedStatus;
    await executor.query(
      `WITH barber_state AS (
         SELECT barber_id, status::text AS old_status, break_started_at
         FROM barbers
         WHERE barber_id = $2
         FOR UPDATE
       ), extended_service AS (
         UPDATE queue_entries qe
         SET service_ends_at = COALESCE(
               qe.service_ends_at,
               COALESCE(qe.service_started_at, qe.timer_started_at, NOW())
                 + (COALESCE(qe.duration_minutes, 30) * INTERVAL '1 minute')
             ) + GREATEST(
               NOW() - GREATEST(
                 barber_state.break_started_at,
                 COALESCE(qe.service_started_at, qe.timer_started_at, barber_state.break_started_at)
               ),
               INTERVAL '0 seconds'
             )
         FROM barber_state
         WHERE qe.barber_id = barber_state.barber_id
           AND qe.status::text = 'serving'
           AND barber_state.break_started_at IS NOT NULL
           AND LOWER(REPLACE(barber_state.old_status, '-', '_')) IN ('on_break', 'break')
           AND LOWER(REPLACE($1, '-', '_')) NOT IN ('on_break', 'break')
         RETURNING qe.id
       ), delayed_reservations AS (
         UPDATE queue_entries qe
         SET estimated_start_at = COALESCE(qe.estimated_start_at, qe.scheduled_start_at)
               + GREATEST(NOW() - barber_state.break_started_at, INTERVAL '0 seconds'),
             schedule_delay_minutes = CASE
               WHEN qe.scheduled_start_at IS NOT NULL THEN COALESCE(qe.schedule_delay_minutes, 0)
                 + CEIL(EXTRACT(EPOCH FROM GREATEST(NOW() - barber_state.break_started_at, INTERVAL '0 seconds')) / 60)::int
               ELSE COALESCE(qe.schedule_delay_minutes, 0)
             END
         FROM barber_state
         WHERE qe.barber_id = barber_state.barber_id
           AND qe.status::text IN ('pending', 'accepted', 'late', 'waiting')
           AND (qe.scheduled_start_at IS NOT NULL OR qe.estimated_start_at IS NOT NULL)
           AND barber_state.break_started_at IS NOT NULL
           AND LOWER(REPLACE(barber_state.old_status, '-', '_')) IN ('on_break', 'break')
           AND LOWER(REPLACE($1, '-', '_')) NOT IN ('on_break', 'break')
         RETURNING qe.id
       )
       UPDATE barbers b
       SET status = $1::barber_status_type,
           break_started_at = CASE
             WHEN LOWER(REPLACE($1, '-', '_')) IN ('on_break', 'break')
               THEN COALESCE(b.break_started_at, NOW())
             ELSE NULL
           END
       WHERE b.barber_id = $2`,
      [dbStatus, barberId]
    );
  }

  /**
   * Verifies a barber belongs to a specific branch.
   */
  async verifyBarberBranch(barberId: string): Promise<number | null> {
    const result = await this.db.query(
      `SELECT u.branch_id FROM barbers b JOIN users u ON b.user_id = u.user_id WHERE b.barber_id = $1`,
      [barberId]
    );
    return result.rows[0]?.branch_id || null;
  }
}

export const cashierRepository = new CashierRepository();
