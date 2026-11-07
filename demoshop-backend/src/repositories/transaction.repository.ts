import { PoolClient } from 'pg';
import db from '../db';

export interface TransactionServiceLine {
  serviceId: number;
  price: number;
  customSpecification?: string | null;
}

export interface TransactionPaymentLine {
  serviceId: number;
  method: string;
  gcashRefLast4?: string | null;
  gcashReference?: string | null;
}

export interface CreateQueueTransactionsData {
  queueEntryId: number;
  paymentAttemptId: number;
  branchId: number;
  barberId: number | null;
  customerId: number | null;
  serviceLines: TransactionServiceLine[];
  paymentMethod?: string;
  paymentLines?: TransactionPaymentLine[];
  cashReceivedAmount?: number | null;
  cashChangeAmount?: number | null;
  idempotencyKey: string;
}

export interface CreateReservationFeeData {
  queueEntryId: number;
  branchId: number;
  barberId?: number | null;
  customerId?: number | null;
  amount: number;
  paymentMethod: string;
  gcashRefNo?: string | null;
  idempotencyKey?: string;
}

export interface CreateRetailSaleData {
  branchId: number;
  cashierId?: string | null;
  customerName?: string | null;
  totalAmount: number;
  paymentMethod: string;
  gcashRefNo?: string | null;
  idempotencyKey: string;
}

export interface AttachRetailToTransactionData {
  transactionId: number;
  queueEntryId: number;
  retailTotal: number;
}

export interface TransactionHistoryCursor {
  createdAt: string;
  transactionId: number;
  direction: 'next';
}

export const encodeTransactionHistoryCursor = (cursor: TransactionHistoryCursor): string =>
  Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');


export class TransactionRepository {
  async findReceiptPathForTransaction(transactionId: number, branchId?: number): Promise<{ path: string | null; proofImageUrl: string | null; branchId: number } | null> {
    const result = await db.query(
      `SELECT t.branch_id,
              COALESCE(pa.receipt_storage_path, t.reservation_fee_receipt_storage_path) AS receipt_storage_path,
              qe.proof_image_url
       FROM transactions t
       LEFT JOIN payment_attempts pa ON pa.payment_attempt_id = t.payment_attempt_id
       LEFT JOIN queue_entries qe ON qe.id = t.queue_entry_id
       WHERE t.transaction_id = $1
         AND ($2::int IS NULL OR t.branch_id = $2)
         AND (COALESCE(pa.receipt_storage_path, t.reservation_fee_receipt_storage_path) IS NOT NULL
              OR qe.proof_image_url IS NOT NULL)
       LIMIT 1`,
      [transactionId, branchId || null],
    );
    const row = result.rows[0];
    return row
      ? {
          path: row.receipt_storage_path ? String(row.receipt_storage_path) : null,
          proofImageUrl: row.proof_image_url ? String(row.proof_image_url) : null,
          branchId: Number(row.branch_id),
        }
      : null;
  }

  async findLatestGcashReceiptPath(queueId: number, branchId?: number): Promise<string | null> {
    const result = await db.query(
      `SELECT pa.receipt_storage_path
       FROM transactions t
       JOIN payment_attempts pa ON pa.payment_attempt_id = t.payment_attempt_id
       JOIN queue_entries q ON q.id = t.queue_entry_id
       WHERE q.id = $1 AND q.payment_status = 'paid'
         AND t.payment_method = 'GCash' AND pa.receipt_storage_path IS NOT NULL
         AND ($2::int IS NULL OR q.branch_id = $2)
       ORDER BY t.transaction_id DESC LIMIT 1`,
      [queueId, branchId || null],
    );
    return result.rows[0]?.receipt_storage_path || null;
  }

  async findReservationFeeByQueueId(queueId: number, branchId?: number): Promise<any | null> {
    const result = await db.query(
      `SELECT transaction_id, queue_entry_id, payment_attempt_id,
              branch_id, barber_id, customer_id, total_amount,
              payment_method, gcash_ref_no, transaction_type, created_at
       FROM transactions
       WHERE queue_entry_id = $1 AND transaction_type = 'reservation_fee'
         AND ($2::int IS NULL OR branch_id = $2)
       ORDER BY transaction_id DESC LIMIT 1`,
      [queueId, branchId || null],
    );
    return result.rows[0] || null;
  }

  async addReservationFeeGcashReference(transactionId: number, branchId: number, reference: string): Promise<any | null> {
    const result = await db.query(
      `UPDATE transactions
       SET gcash_ref_no = $3
       WHERE transaction_id = $1
         AND branch_id = $2
         AND transaction_type = 'reservation_fee'
         AND payment_method = 'GCash'
         AND (gcash_ref_no IS NULL OR BTRIM(gcash_ref_no) = ''
              OR regexp_replace(upper(gcash_ref_no), '[^A-Z0-9]', '', 'g') = $3)
       RETURNING transaction_id, queue_entry_id, branch_id, total_amount, payment_method, gcash_ref_no, transaction_type, created_at`,
      [transactionId, branchId, reference],
    );
    return result.rows[0] || null;
  }

  async findReservationFeeGcashReference(transactionId: number, branchId: number): Promise<string | null | undefined> {
    const result = await db.query(
      `SELECT gcash_ref_no FROM transactions
       WHERE transaction_id = $1 AND branch_id = $2
         AND transaction_type = 'reservation_fee' AND payment_method = 'GCash'`,
      [transactionId, branchId],
    );
    return result.rows[0]?.gcash_ref_no ?? (result.rows[0] ? null : undefined);
  }

  async addReservationFeeReceiptEvidence(input: {
    transactionId: number;
    branchId: number;
    storagePath: string;
    sha256: string;
    width: number;
    height: number;
    reference?: string | null;
  }): Promise<any | null> {
    const result = await db.query(
      `UPDATE transactions
       SET reservation_fee_receipt_storage_path = $3,
           reservation_fee_receipt_sha256 = $4,
           reservation_fee_receipt_width = $5,
           reservation_fee_receipt_height = $6,
           gcash_ref_no = COALESCE(NULLIF(BTRIM(gcash_ref_no), ''), NULLIF($7, ''))
       WHERE transaction_id = $1
         AND branch_id = $2
         AND transaction_type = 'reservation_fee'
         AND payment_method = 'GCash'
         AND reservation_fee_receipt_storage_path IS NULL
       RETURNING transaction_id, queue_entry_id, branch_id, total_amount, payment_method, gcash_ref_no,
                 reservation_fee_receipt_storage_path, transaction_type, created_at`,
      [input.transactionId, input.branchId, input.storagePath, input.sha256, input.width, input.height, input.reference || null],
    );
    return result.rows[0] || null;
  }

  async findReservationFeeReceiptPath(transactionId: number, branchId: number): Promise<string | null> {
    const result = await db.query(
      `SELECT reservation_fee_receipt_storage_path
       FROM transactions
       WHERE transaction_id = $1 AND branch_id = $2
         AND transaction_type = 'reservation_fee' AND payment_method = 'GCash'`,
      [transactionId, branchId],
    );
    return result.rows[0]?.reservation_fee_receipt_storage_path || null;
  }

  async createReservationFee(client: any, data: CreateReservationFeeData): Promise<any> {
    const idempotencyKey = data.idempotencyKey || `reservation-fee-${data.queueEntryId}:${data.paymentMethod}`;
    const existing = await client.query(
      `SELECT transaction_id, queue_entry_id, payment_attempt_id, branch_id, barber_id, customer_id,
              total_amount, payment_method, gcash_ref_no, transaction_type, created_at
       FROM transactions
       WHERE idempotency_key = $1 OR (queue_entry_id = $2 AND transaction_type = 'reservation_fee')
       LIMIT 1`,
      [idempotencyKey, data.queueEntryId],
    );
    if (existing.rows[0]) {
      return existing.rows[0];
    }

    const numericAmount = Number(data.amount) > 0 ? Number(data.amount) : 50;
    const inserted = await client.query(
      `INSERT INTO transactions (
         branch_id, barber_id, customer_id, queue_entry_id,
         idempotency_key, total_amount, payment_method, gcash_ref_no, transaction_type
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'reservation_fee')
       RETURNING transaction_id, queue_entry_id, payment_attempt_id, branch_id, barber_id, customer_id,
                 total_amount, payment_method, gcash_ref_no, transaction_type, created_at`,
      [
        data.branchId,
        data.barberId || null,
        data.customerId || null,
        data.queueEntryId,
        idempotencyKey,
        numericAmount.toFixed(2),
        data.paymentMethod,
        data.paymentMethod === 'GCash' ? data.gcashRefNo || null : null,
      ],
    );
    return inserted.rows[0];
  }

  async createForQueueEntry(client: PoolClient, data: CreateQueueTransactionsData): Promise<any[]> {
    const serviceIds = data.serviceLines.map((line) => line.serviceId);
    const fallbackMethod = data.paymentMethod || 'Cash';
    const suppliedLines = data.paymentLines?.length
      ? data.paymentLines
      : serviceIds.map((serviceId) => ({ serviceId, method: fallbackMethod }));
    const expectedIds = [...serviceIds].sort((a, b) => a - b);
    const suppliedIds = suppliedLines.map((line) => line.serviceId).sort((a, b) => a - b);

    if (expectedIds.length !== suppliedIds.length || expectedIds.some((id, index) => id !== suppliedIds[index])) {
      throw new Error('Payment lines must match the selected services.');
    }

    const prices = new Map(data.serviceLines.map((line) => [line.serviceId, line.price]));
    const grouped = new Map<string, TransactionPaymentLine[]>();
    for (const line of suppliedLines) {
      const entries = grouped.get(line.method) || [];
      entries.push(line);
      grouped.set(line.method, entries);
    }

    // Queue payments with no service lines still need a parent transaction so
    // any retail sale lines can be attached during finalization.
    if (grouped.size === 0) grouped.set(fallbackMethod, []);

    const transactions: any[] = [];
    for (const [method, lines] of grouped) {
      const transactionKey = `${data.idempotencyKey}:${method}`;
      const total = lines.reduce((sum, line) => sum + (prices.get(line.serviceId) || 0), 0);
      const gcashRefs = method === 'GCash'
        ? lines.map((line) => line.gcashReference || line.gcashRefLast4).find(Boolean) || null
        : null;
      const inserted = await client.query(
        `WITH inserted_transaction AS (INSERT INTO transactions (
           branch_id, barber_id, customer_id, queue_entry_id, payment_attempt_id,
           idempotency_key, total_amount, payment_method, gcash_ref_no, transaction_type,
           cash_received_amount, cash_change_amount
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'service', $12, $13)
         ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
         RETURNING transaction_id, queue_entry_id, payment_attempt_id, branch_id, barber_id, customer_id,
                   total_amount, payment_method, gcash_ref_no, transaction_type, cash_received_amount, cash_change_amount, created_at
         ), inserted_services AS (
           INSERT INTO transaction_services (transaction_id, service_id, actual_price_at_time, custom_specification)
           SELECT t.transaction_id, selected.service_id, selected.price, selected.custom_specification
           FROM inserted_transaction t
           CROSS JOIN UNNEST($10::int[], $11::numeric[], $14::text[]) AS selected(service_id, price, custom_specification)
           RETURNING transaction_id
         )
         SELECT * FROM inserted_transaction
         UNION ALL
         SELECT transaction_id, queue_entry_id, payment_attempt_id, branch_id, barber_id, customer_id,
                total_amount, payment_method, gcash_ref_no, transaction_type, cash_received_amount, cash_change_amount, created_at
         FROM transactions WHERE idempotency_key = $6
           AND NOT EXISTS (SELECT 1 FROM inserted_transaction)`,
        [
          data.branchId,
          data.barberId,
          data.customerId,
          data.queueEntryId,
          data.paymentAttemptId,
          transactionKey,
          total.toFixed(2),
          method,
          gcashRefs,
          lines.map(line => line.serviceId),
          lines.map(line => prices.get(line.serviceId) || 0),
          method === 'Cash' ? data.cashReceivedAmount?.toFixed(2) ?? null : null,
          method === 'Cash' ? data.cashChangeAmount?.toFixed(2) ?? null : null,
          lines.map(line => data.serviceLines.find(service => service.serviceId === line.serviceId)?.customSpecification || null),
        ],
      );
      let transaction = inserted.rows[0];
      if (!transaction) {
        // ON CONFLICT can wait for a concurrent commit that is outside the
        // statement snapshot. A new statement sees that original transaction.
        const existing = await client.query(
          `SELECT transaction_id, queue_entry_id, payment_attempt_id, branch_id, barber_id, customer_id,
                  total_amount, payment_method, gcash_ref_no, transaction_type, cash_received_amount, cash_change_amount, created_at
           FROM transactions WHERE idempotency_key = $1`,
          [transactionKey],
        );
        transaction = existing.rows[0];
      }
      if (!transaction) throw new Error('Payment transaction could not be recorded.');
      transactions.push(transaction);
    }

    return transactions;
  }

  /**
   * Records a completed retail-only sale with cashier attribution and no queue_entry_id.
   */
  async createRetailSale(client: PoolClient, data: CreateRetailSaleData): Promise<any> {
    const existing = await client.query(
      `SELECT transaction_id, queue_entry_id, payment_attempt_id, branch_id, barber_id, customer_id,
              cashier_id, customer_name, total_amount, payment_method, gcash_ref_no, transaction_type, created_at
       FROM transactions WHERE idempotency_key = $1`,
      [data.idempotencyKey],
    );
    if (existing.rows[0]) {
      return existing.rows[0];
    }

    const inserted = await client.query(
      `INSERT INTO transactions (
         branch_id, barber_id, customer_id, queue_entry_id, payment_attempt_id,
         cashier_id, customer_name, idempotency_key, total_amount, payment_method,
         gcash_ref_no, transaction_type
       )
       VALUES ($1, NULL, NULL, NULL, NULL, $2, $3, $4, $5, $6, $7, 'retail')
       RETURNING transaction_id, queue_entry_id, payment_attempt_id, branch_id, barber_id, customer_id,
                 cashier_id, customer_name, total_amount, payment_method, gcash_ref_no, transaction_type, created_at`,
      [
        data.branchId,
        data.cashierId || null,
        data.customerName || null,
        data.idempotencyKey,
        Number(data.totalAmount).toFixed(2),
        data.paymentMethod,
        data.paymentMethod === 'GCash' ? data.gcashRefNo || null : null,
      ],
    );
    return inserted.rows[0];
  }

  /** Adds mixed-order retail totals onto the service checkout transaction. */
  async attachRetailToTransaction(client: PoolClient, data: AttachRetailToTransactionData): Promise<void> {
    if (!(Number(data.retailTotal) > 0)) return;
    await client.query(
      `UPDATE transactions
       SET total_amount = (total_amount + $2::numeric)
       WHERE transaction_id = $1`,
      [data.transactionId, Number(data.retailTotal).toFixed(2)],
    );
    await client.query(
      `UPDATE inventory_retail_sale_lines
       SET transaction_id = $1
       WHERE queue_entry_id = $2 AND transaction_id IS NULL`,
      [data.transactionId, data.queueEntryId],
    );
  }

  /**
   * Retrieves authoritative transaction history ledger with multi-faceted filtering,
   * comprehensive line-item breakdowns, and aggregated KPI metrics.
   */
  async getTransactionHistory(options: {
    branchId?: number | null;
    startDate?: string;
    endDate?: string;
    search?: string;
    channel?: 'all' | 'walk-in' | 'online' | 'retail' | 'unknown';
    paymentMethod?: string;
    barberId?: string;
    status?: string;
    category?: string;
    minAmount?: number;
    maxAmount?: number;
    page?: number;
    limit?: number;
    cursor?: TransactionHistoryCursor;
    sortBy?: string;
  }): Promise<{
    transactions: any[];
    metrics: {
      totalGrossVolume: number;
      transactionCount: number;
      walkInCount: number;
      onlineCount: number;
      retailCount: number;
      averageTicketValue: number;
    };
    total: number;
    nextCursor?: string | null;
  }> {
    const {
      branchId,
      startDate,
      endDate,
      search,
      channel = 'all',
      paymentMethod = 'all',
      barberId = 'all',
      status = 'all',
      category = 'all',
      minAmount,
      maxAmount,
      page = 1,
      limit = 25,
      cursor,
      sortBy = 'date_desc',
    } = options;

    const queryParams: Array<number | string> = [];
    const conditions: string[] = ['1=1'];
    // Cashier-created scheduled reservations deliberately remain non-walk-in
    // queue entries for scheduling. Their server-generated fee key records origin
    // and survives later settlement/payment-method changes and rescheduling.
    const manualReservationSql = `(t.idempotency_key LIKE 'manual-reservation-fee-%' OR EXISTS (
      SELECT 1 FROM transactions origin_fee
      WHERE origin_fee.queue_entry_id = t.queue_entry_id
        AND origin_fee.transaction_type = 'reservation_fee'
        AND origin_fee.idempotency_key LIKE 'manual-reservation-fee-%'
    ))`;
    const channelSql = `(CASE
      WHEN t.transaction_type = 'retail' OR (t.queue_entry_id IS NULL AND t.transaction_type != 'reservation_fee') THEN 'retail'
      WHEN ${manualReservationSql} THEN 'walk-in'
      WHEN qe.is_walk_in IS TRUE THEN 'walk-in'
      WHEN qe.is_walk_in IS FALSE AND qe.customer_id IS NOT NULL THEN 'online'
      WHEN qe.is_walk_in IS FALSE THEN 'online'
      ELSE 'unknown' END)`;

    const addParam = (val: number | string) => {
      queryParams.push(val);
      return queryParams.length;
    };

    if (branchId != null && Number(branchId) > 0) {
      conditions.push(`t.branch_id = $${addParam(Number(branchId))}`);
    }

    if (startDate) {
      conditions.push(`(t.created_at AT TIME ZONE 'Asia/Manila')::date >= $${addParam(startDate)}::date`);
    }

    if (endDate) {
      conditions.push(`(t.created_at AT TIME ZONE 'Asia/Manila')::date <= $${addParam(endDate)}::date`);
    }

    if (channel && channel !== 'all') {
      conditions.push(`${channelSql} = $${addParam(channel)}`);
    }

    if (paymentMethod && paymentMethod !== 'all') {
      if (paymentMethod.toLowerCase() === 'cash') {
        conditions.push(`LOWER(t.payment_method) = 'cash'`);
      } else if (paymentMethod.toLowerCase() === 'gcash') {
        conditions.push(`LOWER(t.payment_method) = 'gcash'`);
      } else {
        conditions.push(`t.payment_method ILIKE $${addParam(`%${paymentMethod}%`)}`);
      }
    }

    if (barberId && barberId !== 'all') {
      if (barberId === 'unassigned') {
        conditions.push(`(t.barber_id IS NULL AND qe.barber_id IS NULL)`);
      } else if (Number(barberId) > 0) {
        conditions.push(`COALESCE(t.barber_id, qe.barber_id) = $${addParam(Number(barberId))}`);
      }
    }

    if (status && status !== 'all' && status !== 'completed') {
      // In this system all records in transactions are completed settlements.
      // Other statuses (refunded, voided, pending) have no matching rows.
      conditions.push(`1=0`);
    }

    if (category && category !== 'all') {
      if (category === 'haircuts') {
        conditions.push(`(EXISTS (
          SELECT 1 FROM transaction_services ts_cat
          JOIN services s_cat ON s_cat.service_id = ts_cat.service_id
          WHERE ts_cat.transaction_id = t.transaction_id
            AND (s_cat.category ILIKE '%hair%' OR s_cat.sub_category ILIKE '%hair%' OR s_cat.title ILIKE '%cut%' OR s_cat.title ILIKE '%fade%')
        ))`);
      } else if (category === 'grooming') {
        conditions.push(`(EXISTS (
          SELECT 1 FROM transaction_services ts_cat
          JOIN services s_cat ON s_cat.service_id = ts_cat.service_id
          WHERE ts_cat.transaction_id = t.transaction_id
            AND (s_cat.category ILIKE '%groom%' OR s_cat.category ILIKE '%treatment%' OR s_cat.sub_category ILIKE '%shave%' OR s_cat.title ILIKE '%shave%')
        ))`);
      } else if (category === 'retail') {
        conditions.push(`(t.transaction_type = 'retail' OR EXISTS (
          SELECT 1 FROM inventory_retail_sale_lines rsl_cat
          WHERE rsl_cat.transaction_id = t.transaction_id OR (rsl_cat.queue_entry_id = t.queue_entry_id AND t.queue_entry_id IS NOT NULL)
        ))`);
      }
    }

    if (minAmount != null && Number(minAmount) >= 0) {
      conditions.push(`t.total_amount >= $${addParam(Number(minAmount))}`);
    }

    if (maxAmount != null && Number(maxAmount) > 0) {
      conditions.push(`t.total_amount <= $${addParam(Number(maxAmount))}`);
    }

    const trimmedSearch = search?.trim();
    if (trimmedSearch) {
      const searchParam = addParam(`%${trimmedSearch}%`);
      conditions.push(`(
        t.transaction_id::text ILIKE $${searchParam}
        OR t.gcash_ref_no ILIKE $${searchParam}
        OR COALESCE(rd.receipt_number, '') ILIKE $${searchParam}
        OR CONCAT_WS(' ', c.first_name, c.last_name) ILIKE $${searchParam}
        OR COALESCE(qe.customer_name, '') ILIKE $${searchParam}
        OR COALESCE(gp.normalized_name, '') ILIKE $${searchParam}
        OR COALESCE(t.customer_name, '') ILIKE $${searchParam}
        OR COALESCE(c.phone_number, '') ILIKE $${searchParam}
      )`);
    }

    const whereClause = conditions.join('\n       AND ');

    // Cursor filtering applies only to the page query. Metrics remain scoped to
    // the complete filter set so totals do not shrink as the user advances.
    const rowConditions = [...conditions];
    const rowQueryParams = [...queryParams];
    const cursorSort = sortBy === 'date_asc' || sortBy === 'date_desc' ? sortBy : null;
    if (cursor && cursorSort) {
      rowQueryParams.push(cursor.createdAt, cursor.transactionId);
      const createdAtParam = rowQueryParams.length - 1;
      const transactionIdParam = rowQueryParams.length;
      rowConditions.push(
        cursorSort === 'date_desc'
          ? `(t.created_at AT TIME ZONE 'UTC', t.transaction_id) < ($${createdAtParam}::timestamptz, $${transactionIdParam}::bigint)`
          : `(t.created_at AT TIME ZONE 'UTC', t.transaction_id) > ($${createdAtParam}::timestamptz, $${transactionIdParam}::bigint)`,
      );
    }
    const rowWhereClause = rowConditions.join('\n       AND ');

    // Metrics summary query across the filtered set
    const metricsResult = await db.query(
      `SELECT
         COALESCE(SUM(t.total_amount), 0)::numeric AS total_gross_volume,
         COUNT(t.transaction_id)::int AS transaction_count,
         COUNT(CASE WHEN ${channelSql} = 'walk-in' THEN 1 END)::int AS walk_in_count,
         COUNT(CASE WHEN ${channelSql} = 'online' THEN 1 END)::int AS online_count,
         COUNT(CASE WHEN ${channelSql} = 'retail' THEN 1 END)::int AS retail_count
       FROM transactions t
       LEFT JOIN queue_entries qe ON qe.id = t.queue_entry_id
       LEFT JOIN customers c ON c.customer_id = COALESCE(t.customer_id, qe.customer_id)
       LEFT JOIN guest_profiles gp ON gp.guest_profile_id = qe.guest_profile_id
       LEFT JOIN barbers b ON b.barber_id = COALESCE(t.barber_id, qe.barber_id)
       LEFT JOIN receipt_documents rd ON rd.transaction_id = t.transaction_id OR (rd.queue_entry_id = t.queue_entry_id AND rd.queue_entry_id IS NOT NULL)
       WHERE ${whereClause}`,
      queryParams,
    );

    const metricsRow = metricsResult.rows[0] || {};
    const totalGrossVolume = Number(Number(metricsRow.total_gross_volume || 0).toFixed(2));
    const transactionCount = Number(metricsRow.transaction_count || 0);
    const walkInCount = Number(metricsRow.walk_in_count || 0);
    const onlineCount = Number(metricsRow.online_count || 0);
    const retailCount = Number(metricsRow.retail_count || 0);
    const averageTicketValue = transactionCount > 0 ? Number((totalGrossVolume / transactionCount).toFixed(2)) : 0;

    // Sorting
    let orderByClause = 't.created_at DESC, t.transaction_id DESC';
    if (sortBy === 'date_asc') orderByClause = 't.created_at ASC, t.transaction_id ASC';
    else if (sortBy === 'amount_desc') orderByClause = 't.total_amount DESC, t.created_at DESC';
    else if (sortBy === 'amount_asc') orderByClause = 't.total_amount ASC, t.created_at DESC';

    const safeLimit = Math.max(1, Math.min(100, Number(limit) || 25));
    const safeOffset = cursorSort && cursor ? 0 : Math.max(0, (Math.max(1, Number(page) || 1) - 1) * safeLimit);

    const paginatedParams = [...rowQueryParams, safeLimit, safeOffset];
    const limitIdx = rowQueryParams.length + 1;
    const offsetIdx = rowQueryParams.length + 2;

    const rowsResult = await db.query(
      `SELECT
         t.transaction_id AS id,
         t.created_at,
         (t.created_at AT TIME ZONE 'Asia/Manila')::date::text AS date,
         TO_CHAR(t.created_at AT TIME ZONE 'Asia/Manila', 'Mon DD, YYYY') AS formatted_date,
         TO_CHAR(t.created_at AT TIME ZONE 'Asia/Manila', 'HH12:MI AM') AS formatted_time,
         COALESCE(t.total_amount, 0)::numeric AS total_amount,
         t.cash_received_amount,
         t.cash_change_amount,
         COALESCE(t.payment_method, 'Cash') AS payment_method,
         t.gcash_ref_no,
         t.transaction_type,
         (pa.receipt_storage_path IS NOT NULL OR t.reservation_fee_receipt_storage_path IS NOT NULL OR qe.proof_image_url IS NOT NULL) AS receipt_available,
         t.queue_entry_id,
         t.cashier_id,
         rd.receipt_number,
         ${channelSql} AS channel,
         ${manualReservationSql} AS is_manual_reservation,
         COALESCE(
           NULLIF(TRIM(CONCAT_WS(' ', c.first_name, c.last_name)), ''),
           NULLIF(TRIM(gp.normalized_name), ''),
           NULLIF(TRIM(qe.customer_name), ''),
           NULLIF(TRIM(t.customer_name), ''),
           'Walk-in Guest'
         ) AS customer_name,
         c.phone_number AS customer_phone,
         c.email AS customer_email,
         c.customer_id,
         COALESCE(t.barber_id, qe.barber_id) AS barber_id,
         COALESCE(NULLIF(TRIM(b.name), ''), NULLIF(TRIM(bu.username), ''), 'Unassigned') AS barber_name,
         bu.profile_picture AS barber_avatar,
         cu.user_id AS cashier_user_id,
         COALESCE(NULLIF(TRIM(cu.username), ''), 'Cashier') AS cashier_name,
         qe.created_at AS appointment_created_at,
         COALESCE(qe.service_ends_at, t.created_at) AS service_completed_at,
         (
           SELECT COALESCE(json_agg(json_build_object(
             'id', ts.ts_id,
             'type', 'service',
             'name', COALESCE(s.title, 'Barber Service'),
             'category', COALESCE(s.category, 'Haircuts & Styling'),
             'quantity', 1,
             'unitPrice', COALESCE(ts.actual_price_at_time, s.price, 0)::numeric,
             'totalPrice', COALESCE(ts.actual_price_at_time, s.price, 0)::numeric,
             'discount', 0,
             'customSpecification', ts.custom_specification
           )), '[]'::json)
           FROM transaction_services ts
           JOIN services s ON s.service_id = ts.service_id
           WHERE ts.transaction_id = t.transaction_id
         ) AS service_lines,
         (
           SELECT COALESCE(json_agg(json_build_object(
             'id', rsl.inventory_retail_sale_line_id,
             'type', 'product',
             'name', COALESCE(ip.name, 'Retail Product'),
             'category', 'Customer Retail',
             'quantity', rsl.quantity,
             'unitPrice', rsl.unit_price::numeric,
             'totalPrice', (rsl.quantity * rsl.unit_price)::numeric,
             'discount', 0
           )), '[]'::json)
           FROM inventory_retail_sale_lines rsl
           JOIN inventory_products ip ON ip.inventory_product_id = rsl.inventory_product_id
           WHERE rsl.transaction_id = t.transaction_id
              OR (rsl.queue_entry_id = t.queue_entry_id AND t.queue_entry_id IS NOT NULL)
         ) AS retail_lines
       FROM transactions t
       LEFT JOIN queue_entries qe ON qe.id = t.queue_entry_id
       LEFT JOIN customers c ON c.customer_id = COALESCE(t.customer_id, qe.customer_id)
       LEFT JOIN guest_profiles gp ON gp.guest_profile_id = qe.guest_profile_id
       LEFT JOIN barbers b ON b.barber_id = COALESCE(t.barber_id, qe.barber_id)
       LEFT JOIN users bu ON bu.user_id = b.user_id
       LEFT JOIN users cu ON cu.user_id = t.cashier_id
        LEFT JOIN payment_attempts pa ON pa.payment_attempt_id = t.payment_attempt_id
       LEFT JOIN receipt_documents rd ON rd.transaction_id = t.transaction_id OR (rd.queue_entry_id = t.queue_entry_id AND rd.queue_entry_id IS NOT NULL)
       WHERE ${rowWhereClause}
       ORDER BY ${orderByClause}
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      paginatedParams,
    );

    const lastRow = rowsResult.rows[rowsResult.rows.length - 1];
    const nextCursor = cursorSort && rowsResult.rows.length === safeLimit && lastRow?.created_at
      ? encodeTransactionHistoryCursor({
          createdAt: new Date(lastRow.created_at).toISOString(),
          transactionId: Number(lastRow.id),
          direction: 'next',
        })
      : null;

    return {
      transactions: rowsResult.rows,
      metrics: {
        totalGrossVolume,
        transactionCount,
        walkInCount,
        onlineCount,
        retailCount,
        averageTicketValue,
      },
      total: transactionCount,
      nextCursor,
    };
  }
}

export const transactionRepository = new TransactionRepository();
