import type { PoolClient } from 'pg';
import db from '../db';
import type { StoredReceiptDocument } from '../utils/receipt/receipt-types';

const LEASE_MINUTES = 2;

type Queryable = {
  query: (...args: any[]) => Promise<any>;
};

export type PrintJobReceipt = Pick<
  StoredReceiptDocument,
  'receipt_document_id' | 'receipt_data' | 'email_status' | 'recipient_email'
>;

export interface PrintJobRow {
  print_job_id: number;
  branch_id: number;
  status: 'queued' | 'claimed' | 'printed' | 'failed';
  attempts: number;
  last_error: string | null;
  receipt: PrintJobReceipt;
  lease_expires_at: string | null;
}

export class ReceiptPrintJobRepository {
  constructor(private readonly queryable: Queryable = db) {}

  async enqueue(client: PoolClient, branchId: number, receiptDocumentId: number): Promise<void> {
    await client.query(
      `INSERT INTO receipt_print_jobs (branch_id, receipt_document_id)
       VALUES ($1, $2)
       ON CONFLICT (receipt_document_id) DO NOTHING`,
      [branchId, receiptDocumentId],
    );
  }

  async claim(branchId: number, stationId: string): Promise<PrintJobRow | null> {
    const result = await this.queryable.query(
      `WITH available AS (
         SELECT print_job_id
         FROM receipt_print_jobs
         WHERE branch_id = $1
           AND (status = 'queued' OR (status = 'claimed' AND lease_expires_at < NOW()))
         ORDER BY created_at, print_job_id
         FOR UPDATE SKIP LOCKED
         LIMIT 1
       ), claimed AS (
       UPDATE receipt_print_jobs j
       SET status = 'claimed', attempts = j.attempts + 1,
           claimed_by = $2, claimed_at = NOW(),
           lease_expires_at = NOW() + ($3 || ' minutes')::interval,
           last_error = NULL, updated_at = NOW()
       FROM available a
       WHERE j.print_job_id = a.print_job_id
       RETURNING j.*
       )
       SELECT claimed.*,
              receipt.receipt_document_id AS joined_receipt_document_id,
              receipt.receipt_data AS joined_receipt_data,
              receipt.email_status AS joined_receipt_email_status,
              receipt.recipient_email AS joined_receipt_recipient_email
       FROM claimed
       JOIN receipt_documents receipt
         ON receipt.receipt_document_id = claimed.receipt_document_id
        AND receipt.branch_id = $1`,
      [branchId, stationId, LEASE_MINUTES],
    );
    const row = result.rows[0];
    if (!row) return null;
    const {
      joined_receipt_document_id: receiptDocumentId,
      joined_receipt_data: receiptData,
      joined_receipt_email_status: receiptEmailStatus,
      joined_receipt_recipient_email: recipientEmail,
      ...job
    } = row;
    return {
      ...job,
      attempts: Number(row.attempts),
      receipt: {
        receipt_document_id: receiptDocumentId,
        receipt_data: receiptData,
        email_status: receiptEmailStatus,
        recipient_email: recipientEmail,
      },
    };
  }

  async markPrinted(jobId: number, branchId: number, stationId: string): Promise<boolean> {
    const result = await db.query(
      `UPDATE receipt_print_jobs
       SET status = 'printed', printed_at = NOW(), updated_at = NOW()
       WHERE print_job_id = $1 AND branch_id = $2 AND status = 'claimed' AND claimed_by = $3
       RETURNING print_job_id`,
      [jobId, branchId, stationId],
    );
    return result.rowCount === 1;
  }

  async markFailed(jobId: number, branchId: number, stationId: string, error: string): Promise<boolean> {
    const result = await db.query(
      `UPDATE receipt_print_jobs
       SET status = 'failed', last_error = $4, updated_at = NOW()
       WHERE print_job_id = $1 AND branch_id = $2 AND status = 'claimed' AND claimed_by = $3
       RETURNING print_job_id`,
      [jobId, branchId, stationId, error.slice(0, 1000)],
    );
    return result.rowCount === 1;
  }

  async retry(jobId: number, branchId: number): Promise<boolean> {
    const result = await db.query(
      `UPDATE receipt_print_jobs
       SET status = 'queued', claimed_by = NULL, claimed_at = NULL,
           lease_expires_at = NULL, last_error = NULL, updated_at = NOW()
       WHERE print_job_id = $1 AND branch_id = $2 AND status = 'failed'
       RETURNING print_job_id`,
      [jobId, branchId],
    );
    return result.rowCount === 1;
  }
}

export const receiptPrintJobRepository = new ReceiptPrintJobRepository();
