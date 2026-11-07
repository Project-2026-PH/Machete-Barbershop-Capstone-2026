import { PoolClient } from 'pg';
import db from '../db';
import { ReceiptContext, ReceiptEmailStatus, StoredReceiptDocument } from '../utils/receipt/receipt-types';

const RECEIPT_COLUMNS = `receipt_document_id, branch_id, queue_entry_id, transaction_id,
  receipt_number, document_version, receipt_data, recipient_email, email_status,
  email_attempts, email_last_attempt_at, email_sent_at, email_last_error,
  created_at, updated_at`;

const mapRow = (row: any): StoredReceiptDocument => ({
  ...row,
  receipt_data: row.receipt_data as StoredReceiptDocument['receipt_data'],
  email_attempts: Number(row.email_attempts || 0),
});

export class ReceiptRepository {
  async findByQueueIdForUpdate(client: PoolClient, queueEntryId: number): Promise<StoredReceiptDocument | null> {
    const result = await client.query(
      `SELECT ${RECEIPT_COLUMNS} FROM receipt_documents WHERE queue_entry_id = $1 FOR UPDATE`,
      [queueEntryId],
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  async findContext(client: PoolClient, queueEntryId: number): Promise<ReceiptContext | null> {
    const result = await client.query(
      `SELECT br.name AS branch_name, br.address AS branch_address,
              COALESCE(NULLIF(TRIM(CONCAT_WS(' ', c.first_name, c.last_name)), ''),
                       NULLIF(TRIM(q.customer_name), ''), 'Walk-in Customer') AS customer_name,
              COALESCE(NULLIF(TRIM(c.email), ''), NULLIF(TRIM(u.email), '')) AS customer_email,
              COALESCE(u.is_verified, FALSE) AS customer_email_verified,
              COALESCE(NULLIF(TRIM(b.name), ''), NULLIF(TRIM(bu.username), ''), 'Unassigned') AS barber_name,
              q.is_walk_in,
              gp.guest_reference, gp.guest_profile_id
       FROM queue_entries q
       JOIN branches br ON br.branch_id = q.branch_id
       LEFT JOIN customers c ON c.customer_id = q.customer_id
       LEFT JOIN users u ON u.user_id = c.user_id
       LEFT JOIN barbers b ON b.barber_id = q.barber_id
       LEFT JOIN users bu ON bu.user_id = b.user_id
       LEFT JOIN guest_profiles gp ON gp.guest_profile_id = q.guest_profile_id
       WHERE q.id = $1`,
      [queueEntryId],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      branchName: row.branch_name,
      branchAddress: row.branch_address || null,
      customerName: row.customer_name,
      customerEmail: row.customer_email || null,
      customerEmailVerified: row.customer_email_verified === true,
      barberName: row.barber_name,
      isWalkIn: row.is_walk_in === true,
      guestReference: row.guest_reference || null,
      guestProfileId: row.guest_profile_id ? Number(row.guest_profile_id) : null,
    };
  }

  async setGuestVisitLookupCodeHash(client: PoolClient, queueEntryId: number, codeHash: string): Promise<boolean> {
    const result = await client.query(
      `UPDATE guest_profiles gp
       SET visit_lookup_code_hash = $2
       FROM queue_entries qe
       WHERE qe.id = $1 AND qe.is_walk_in = TRUE
         AND qe.guest_profile_id = gp.guest_profile_id
       RETURNING gp.guest_profile_id`,
      [queueEntryId, codeHash],
    );
    return result.rowCount === 1;
  }

  /**
   * Resolves branch details directly, for retail-only receipts that have no
   * queue entry to derive context from.
   */
  async findBranch(client: PoolClient, branchId: number): Promise<{ branchName: string; branchAddress: string | null } | null> {
    const result = await client.query(
      `SELECT name AS branch_name, address AS branch_address
       FROM branches WHERE branch_id = $1`,
      [branchId],
    );
    const row = result.rows[0];
    if (!row) return null;
    return { branchName: row.branch_name, branchAddress: row.branch_address || null };
  }

  async findByQueueId(queueEntryId: number, branchId?: number): Promise<StoredReceiptDocument | null> {
    const result = await db.query(
      `SELECT ${RECEIPT_COLUMNS} FROM receipt_documents
       WHERE queue_entry_id = $1 AND ($2::int IS NULL OR branch_id = $2)`,
      [queueEntryId, branchId || null],
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  async findById(receiptDocumentId: number, branchId?: number): Promise<StoredReceiptDocument | null> {
    const result = await db.query(
      `SELECT ${RECEIPT_COLUMNS} FROM receipt_documents
       WHERE receipt_document_id = $1 AND ($2::int IS NULL OR branch_id = $2)`,
      [receiptDocumentId, branchId || null],
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  async findGuestProfileId(queueEntryId: number, branchId?: number): Promise<number | null> {
    const result = await db.query(
      `SELECT guest_profile_id FROM queue_entries
       WHERE id = $1 AND ($2::int IS NULL OR branch_id = $2)`,
      [queueEntryId, branchId || null],
    );
    return result.rows[0]?.guest_profile_id ? Number(result.rows[0].guest_profile_id) : null;
  }

  async findByTransactionId(transactionId: number, branchId?: number): Promise<StoredReceiptDocument | null> {
    const result = await db.query(
      `SELECT ${RECEIPT_COLUMNS} FROM receipt_documents
       WHERE transaction_id = $1 AND ($2::int IS NULL OR branch_id = $2)`,
      [transactionId, branchId || null],
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  async create(
    client: PoolClient,
    data: {
      branchId: number;
      queueEntryId?: number | null;
      transactionId?: number | null;
      receiptNumber: string;
      receiptData: StoredReceiptDocument['receipt_data'];
      recipientEmail: string | null;
    },
  ): Promise<StoredReceiptDocument> {
    // Exactly one scope is present (enforced by receipt_documents_scope_check):
    // queue entries for service orders, transactions for retail-only sales.
    const queueEntryId = data.queueEntryId ?? null;
    const transactionId = data.transactionId ?? null;

    const existing = queueEntryId !== null
      ? await client.query(`SELECT ${RECEIPT_COLUMNS} FROM receipt_documents WHERE queue_entry_id = $1 FOR UPDATE`, [queueEntryId])
      : await client.query(`SELECT ${RECEIPT_COLUMNS} FROM receipt_documents WHERE transaction_id = $1 FOR UPDATE`, [transactionId]);
    if (existing.rows[0]) return mapRow(existing.rows[0]);

    const result = await client.query(
      `INSERT INTO receipt_documents
        (branch_id, queue_entry_id, transaction_id, receipt_number, receipt_data, recipient_email, email_status)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)
       RETURNING ${RECEIPT_COLUMNS}`,
      [
        data.branchId,
        queueEntryId,
        transactionId,
        data.receiptNumber,
        JSON.stringify(data.receiptData),
        data.recipientEmail,
        data.recipientEmail ? 'pending' : 'not_applicable',
      ],
    );
    return mapRow(result.rows[0]);
  }

  async claimEmail(receiptDocumentId: number): Promise<StoredReceiptDocument | null> {
    const result = await db.query(
      `UPDATE receipt_documents
       SET email_status = 'sending', email_attempts = email_attempts + 1,
           email_last_attempt_at = NOW(), updated_at = NOW()
       WHERE receipt_document_id = $1
         AND recipient_email IS NOT NULL
         AND email_status <> 'sent'
         AND (email_status <> 'sending' OR email_last_attempt_at < NOW() - INTERVAL '10 minutes')
       RETURNING ${RECEIPT_COLUMNS}`,
      [receiptDocumentId],
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  async markEmailSent(receiptDocumentId: number): Promise<void> {
    await db.query(
      `UPDATE receipt_documents
       SET email_status = 'sent', email_sent_at = NOW(), email_last_error = NULL, updated_at = NOW()
       WHERE receipt_document_id = $1`,
      [receiptDocumentId],
    );
  }

  async markEmailFailed(receiptDocumentId: number, reason: string): Promise<void> {
    await db.query(
      `UPDATE receipt_documents
       SET email_status = 'failed', email_last_error = $2, updated_at = NOW()
       WHERE receipt_document_id = $1`,
      [receiptDocumentId, reason.slice(0, 500)],
    );
  }

  async markEmailNotApplicable(receiptDocumentId: number): Promise<void> {
    await db.query(
      `UPDATE receipt_documents
       SET email_status = 'not_applicable', updated_at = NOW()
       WHERE receipt_document_id = $1`,
      [receiptDocumentId],
    );
  }
}

export const receiptRepository = new ReceiptRepository();
