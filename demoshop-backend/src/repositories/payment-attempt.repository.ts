import { PoolClient } from 'pg';
import db from '../db';
import { PaymentAttemptStatus } from '../utils/cashier/payment-attempt-state.util';
import { ReceiptEvidence } from '../utils/cashier/receipt-evidence.util';

const PAYMENT_ATTEMPT_COLUMNS = `payment_attempt_id, queue_entry_id, branch_id, customer_id,
  submitted_by, payment_method, amount, authoritative_amount, cash_received_amount, gcash_ref_no,
  receipt_storage_path, receipt_sha256, receipt_width, receipt_height,
  recipient_identifier_detected, evidence_validation_status, evidence_validation_mode,
  status, automated_review, manual_review_reason, manually_reviewed_by,
  manually_reviewed_at, idempotency_key, created_at, updated_at`;

export interface PaymentAttemptRow {
  payment_attempt_id: number;
  queue_entry_id: number;
  branch_id: number;
  customer_id: number | null;
  submitted_by: string | null;
  payment_method: string;
  amount: number | string;
  authoritative_amount: number | string;
  cash_received_amount: number | string | null;
  gcash_ref_no: string | null;
  receipt_storage_path: string | null;
  receipt_sha256: string | null;
  receipt_width: number | null;
  receipt_height: number | null;
  recipient_identifier_detected: string | null;
  evidence_validation_status: string | null;
  evidence_validation_mode: string | null;
  status: PaymentAttemptStatus;
  automated_review: Record<string, unknown> | null;
  manual_review_reason: string | null;
  manually_reviewed_by: string | null;
  manually_reviewed_at: string | null;
  idempotency_key: string;
  created_at: string;
  updated_at: string;
}

export class PaymentAttemptRepository {
  async findById(id: number, branchId?: number): Promise<PaymentAttemptRow | null> {
    const result = await db.query(
      `SELECT ${PAYMENT_ATTEMPT_COLUMNS} FROM payment_attempts
       WHERE payment_attempt_id = $1
         AND ($2::int IS NULL OR branch_id = $2)`,
      [id, branchId || null],
    );
    return result.rows[0] || null;
  }

  async findByIdempotencyKey(key: string, branchId?: number): Promise<PaymentAttemptRow | null> {
    const result = await db.query(
      `SELECT ${PAYMENT_ATTEMPT_COLUMNS} FROM payment_attempts
       WHERE idempotency_key = $1
         AND ($2::int IS NULL OR branch_id = $2)`,
      [key, branchId || null],
    );
    return result.rows[0] || null;
  }

  async findLatestByQueue(queueId: number, branchId?: number): Promise<PaymentAttemptRow | null> {
    const result = await db.query(
      `SELECT ${PAYMENT_ATTEMPT_COLUMNS} FROM payment_attempts
       WHERE queue_entry_id = $1
         AND ($2::int IS NULL OR branch_id = $2)
       ORDER BY created_at DESC, payment_attempt_id DESC LIMIT 1`,
      [queueId, branchId || null],
    );
    return result.rows[0] || null;
  }

  async create(client: PoolClient, data: {
    queueEntryId: number;
    branchId: number;
    customerId: number | null;
    submittedBy: string | null;
    method: string;
    amount: number;
    authoritativeAmount: number;
    cashReceivedAmount?: number | null;
    gcashReference?: string | null;
    receiptSha256?: string | null;
    receiptWidth?: number | null;
    receiptHeight?: number | null;
    recipientIdentifierDetected?: string | null;
    evidenceValidationStatus?: string | null;
    evidenceValidationMode?: string | null;
    idempotencyKey: string;
  }): Promise<PaymentAttemptRow> {
    const result = await client.query(
      `INSERT INTO payment_attempts (
        queue_entry_id, branch_id, customer_id, submitted_by,
        payment_method, amount, authoritative_amount, cash_received_amount, gcash_ref_no,
        receipt_sha256, receipt_width, receipt_height, recipient_identifier_detected,
        evidence_validation_status, evidence_validation_mode, idempotency_key
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING ${PAYMENT_ATTEMPT_COLUMNS}`,
      [
        data.queueEntryId,
        data.branchId,
        data.customerId,
        data.submittedBy,
        data.method,
        data.amount.toFixed(2),
        data.authoritativeAmount.toFixed(2),
        data.cashReceivedAmount == null ? null : data.cashReceivedAmount.toFixed(2),
        data.gcashReference || null,
        data.receiptSha256 || null,
        data.receiptWidth || null,
        data.receiptHeight || null,
        data.recipientIdentifierDetected || null,
        data.evidenceValidationStatus || null,
        data.evidenceValidationMode || null,
        data.idempotencyKey,
      ],
    );
    return result.rows[0];
  }

  async setReceiptReady(id: number, path: string, evidence?: ReceiptEvidence, gcashReference?: string | null): Promise<void> {
    await db.query(
      `WITH updated_attempt AS (
         UPDATE payment_attempts
         SET receipt_storage_path = $2,
             receipt_sha256 = COALESCE($3, receipt_sha256),
             receipt_width = COALESCE($4, receipt_width),
             receipt_height = COALESCE($5, receipt_height),
             gcash_ref_no = COALESCE($6, gcash_ref_no),
             evidence_validation_status = 'receipt_stored', updated_at = NOW()
         WHERE payment_attempt_id = $1 AND status IN ('pending_verification', 'manually_confirmed')
         RETURNING payment_attempt_id
       )
       UPDATE transactions
       SET gcash_ref_no = $6
       WHERE payment_attempt_id IN (SELECT payment_attempt_id FROM updated_attempt)
         AND $6 IS NOT NULL`,
      [id, path, evidence?.sha256 || null, evidence?.width || null, evidence?.height || null, gcashReference || null],
    );
  }

  async markStorageFailed(id: number, reason: string): Promise<void> {
    await db.query(
      `UPDATE payment_attempts
       SET status = 'rejected', evidence_validation_status = 'storage_failed',
           manual_review_reason = $2, updated_at = NOW()
       WHERE payment_attempt_id = $1 AND status = 'pending_verification'`,
      [id, reason.slice(0, 500)],
    );
  }

  async updateAutomatedReview(id: number, status: 'automated_review_passed' | 'flagged', review: Record<string, unknown>): Promise<void> {
    await db.query(
      `UPDATE payment_attempts
       SET status = $2, automated_review = $3::jsonb,
           evidence_validation_status = $2, updated_at = NOW()
       WHERE payment_attempt_id = $1 AND status = 'pending_verification'`,
      [id, status, JSON.stringify(review)],
    );
  }

  async list(branchId?: number, status?: PaymentAttemptStatus, openOnly: boolean = false): Promise<any[]> {
    const params: Array<number | string> = [];
    const conditions: string[] = [];

    if (branchId !== undefined && branchId !== null && Number(branchId) > 0) {
      params.push(Number(branchId));
      conditions.push(`pa.branch_id = $${params.length}`);
    }

    if (openOnly) {
      conditions.push(`pa.status IN ('pending_verification', 'automated_review_passed', 'flagged')`);
    } else if (status) {
      params.push(status);
      conditions.push(`pa.status = $${params.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await db.query(
      `SELECT pa.payment_attempt_id, pa.queue_entry_id, pa.branch_id, pa.customer_id,
              pa.payment_method, pa.amount, pa.authoritative_amount, pa.gcash_ref_no,
              pa.evidence_validation_status, pa.recipient_identifier_detected, pa.status, pa.created_at, pa.updated_at,
              qe.status AS service_status, qe.is_walk_in, qe.customer_name,
              qe.preferred_date, qe.preferred_time, c.first_name, c.last_name,
              b.name AS barber_name
       FROM payment_attempts pa
       JOIN queue_entries qe ON qe.id = pa.queue_entry_id
       LEFT JOIN customers c ON c.customer_id = pa.customer_id
       LEFT JOIN barbers b ON b.barber_id = qe.barber_id
       ${whereClause}
       ORDER BY pa.created_at DESC
       LIMIT 100`,
      params,
    );
    return result.rows;
  }
}

export const paymentAttemptRepository = new PaymentAttemptRepository();
